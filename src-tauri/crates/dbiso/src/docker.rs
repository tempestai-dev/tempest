use bollard::Docker;
use bollard::container::{Config, CreateContainerOptions, LogOutput, RemoveContainerOptions, StopContainerOptions};
use bollard::exec::{CreateExecOptions, StartExecResults};
use bollard::image::{CommitContainerOptions, CreateImageOptions};
use bollard::models::{HostConfig, PortBinding};
use futures_util::StreamExt;
use std::collections::HashMap;

use crate::types::{BaseImage, DbBranch, SnapshotMethod};

pub async fn check_docker() -> bool {
    match Docker::connect_with_local_defaults() {
        Ok(docker) => docker.ping().await.is_ok(),
        Err(_) => false,
    }
}

/// Exec a command in the container, stream output lines to on_progress,
/// and return Err if the exit code is non-zero.
async fn exec_capture(
    docker: &Docker,
    id: &str,
    cmd: Vec<String>,
    env: Option<Vec<String>>,
    on_progress: &(impl Fn(String) + Send),
) -> Result<String, String> {
    let exec = docker
        .create_exec(
            id,
            CreateExecOptions {
                cmd: Some(cmd),
                env,
                attach_stdout: Some(true),
                attach_stderr: Some(true),
                ..Default::default()
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut combined = String::new();
    if let StartExecResults::Attached { mut output, .. } = docker
        .start_exec(&exec.id, None)
        .await
        .map_err(|e| e.to_string())?
    {
        while let Some(chunk) = output.next().await {
            match chunk.map_err(|e| e.to_string())? {
                LogOutput::StdOut { message } | LogOutput::StdErr { message } => {
                    let s = String::from_utf8_lossy(&message).into_owned();
                    on_progress(s.trim_end().to_string());
                    combined.push_str(&s);
                }
                _ => {}
            }
        }
    }

    let inspect = docker.inspect_exec(&exec.id).await.map_err(|e| e.to_string())?;
    if let Some(code) = inspect.exit_code {
        if code != 0 {
            return Err(format!("command exited with code {code}: {combined}"));
        }
    }
    Ok(combined)
}

/// Exec pg_isready in a loop until postgres is accepting connections (15s timeout).
async fn wait_pg_ready(docker: &Docker, id: &str) -> Result<(), String> {
    for _ in 0..60u32 {
        let exec = docker
            .create_exec(
                id,
                CreateExecOptions {
                    cmd: Some(vec![
                        "pg_isready".to_string(),
                        "-U".to_string(),
                        "postgres".to_string(),
                    ]),
                    attach_stdout: Some(true),
                    attach_stderr: Some(true),
                    ..Default::default()
                },
            )
            .await
            .map_err(|e| e.to_string())?;

        if let StartExecResults::Attached { mut output, .. } =
            docker.start_exec(&exec.id, None).await.map_err(|e| e.to_string())?
        {
            while output.next().await.is_some() {}
        }

        let inspect = docker.inspect_exec(&exec.id).await.map_err(|e| e.to_string())?;
        if inspect.exit_code == Some(0) {
            return Ok(());
        }
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    }
    Err("postgres did not become ready within 15 seconds".to_string())
}

/// Run ANALYZE + CHECKPOINT then stop — so branches start with no WAL replay.
async fn prewarm(
    docker: &Docker,
    id: &str,
    on_progress: &(impl Fn(String) + Send),
) -> Result<(), String> {
    on_progress("Prewarming database…".to_string());
    exec_capture(
        docker,
        id,
        vec![
            "pg_ctl".to_string(),
            "start".to_string(),
            "-D".to_string(),
            "/pgdata".to_string(),
            "-o".to_string(),
            "-p 5432 -c listen_addresses=*".to_string(),
        ],
        None,
        on_progress,
    )
    .await?;
    wait_pg_ready(docker, id).await?;
    exec_capture(
        docker,
        id,
        vec![
            "psql".to_string(),
            "-U".to_string(),
            "postgres".to_string(),
            "-p".to_string(),
            "5432".to_string(),
            "-c".to_string(),
            "ANALYZE; CHECKPOINT;".to_string(),
        ],
        None,
        on_progress,
    )
    .await?;
    exec_capture(
        docker,
        id,
        vec![
            "pg_ctl".to_string(),
            "stop".to_string(),
            "-D".to_string(),
            "/pgdata".to_string(),
            "-m".to_string(),
            "fast".to_string(),
        ],
        None,
        on_progress,
    )
    .await?;
    Ok(())
}

/// Write performance tuning flags into postgresql.auto.conf so branches start fast.
async fn tune(docker: &Docker, id: &str) -> Result<(), String> {
    exec_capture(
        docker,
        id,
        vec![
            "sh".to_string(),
            "-c".to_string(),
            "printf 'fsync=off\\nsynchronous_commit=off\\nfull_page_writes=off\\n\
             wal_level=minimal\\nmax_wal_senders=0\\nshared_buffers=256MB\\n' \
             >> /pgdata/postgresql.auto.conf".to_string(),
        ],
        None,
        &|_| {},
    )
    .await?;
    // Allow all connections (branches are local-only)
    exec_capture(
        docker,
        id,
        vec![
            "sh".to_string(),
            "-c".to_string(),
            "printf 'local all all trust\\nhost all all 0.0.0.0/0 trust\\n' \
             > /pgdata/pg_hba.conf".to_string(),
        ],
        None,
        &|_| {},
    )
    .await?;
    Ok(())
}

/// True when the connection string targets a Supabase pooler or pgbouncer —
/// these don't support the replication protocol, so we force pgdump.
fn is_pooler(conn_str: &str) -> bool {
    conn_str.contains(".pooler.supabase.com") || conn_str.contains("pgbouncer")
}

/// Parse a postgres:// URL into (host, port, user, password).
fn parse_pg_url(conn_str: &str) -> Result<(String, u16, String, Option<String>), String> {
    let url = url::Url::parse(conn_str).map_err(|e| e.to_string())?;
    let host = url.host_str().ok_or("missing host")?.to_string();
    let port = url.port().unwrap_or(5432);
    let user = url.username().to_string();
    let password = url.password().map(String::from);
    Ok((host, port, user, password))
}

pub async fn build_base_image(
    conn_str: &str,
    mut method: SnapshotMethod,
    project_name: &str,
    on_progress: impl Fn(String) + Send + 'static,
) -> Result<BaseImage, String> {
    // Pooler connections can't do basebackup
    if is_pooler(conn_str) && method == SnapshotMethod::BaseBackup {
        on_progress("Pooler detected — switching to pg_dump method".to_string());
        method = SnapshotMethod::PgDump;
    }

    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    let pg_version: u32 = 16;
    let image_tag = format!("postgres:{pg_version}-alpine");

    // Pull image
    on_progress(format!("Pulling {image_tag}…"));
    let mut pull_stream = docker.create_image(
        Some(CreateImageOptions {
            from_image: image_tag.as_str(),
            ..Default::default()
        }),
        None,
        None,
    );
    while let Some(info) = pull_stream.next().await {
        match info {
            Ok(i) => {
                if let Some(status) = i.status {
                    on_progress(status);
                }
            }
            Err(e) => return Err(e.to_string()),
        }
    }

    // Create staging container with PGDATA at /pgdata (not the declared VOLUME
    // path /var/lib/postgresql/data — docker commit excludes VOLUME contents)
    let staging_name = format!("tempest-staging-{}", &uuid::Uuid::new_v4().to_string()[..8]);
    on_progress(format!("Creating staging container {staging_name}…"));
    let create_resp = docker
        .create_container(
            Some(CreateContainerOptions {
                name: staging_name.as_str(),
                platform: None,
            }),
            Config {
                image: Some(image_tag.as_str()),
                entrypoint: Some(vec!["sleep", "infinity"]),
                env: Some(vec!["PGDATA=/pgdata"]),
                ..Default::default()
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    let staging_id = create_resp.id;
    docker
        .start_container(&staging_id, None::<bollard::container::StartContainerOptions<String>>)
        .await
        .map_err(|e| e.to_string())?;

    let result = build_inner(&docker, &staging_id, conn_str, &method, project_name, &on_progress).await;

    // Always clean up staging container
    let _ = docker
        .stop_container(&staging_id, Some(StopContainerOptions { t: 5 }))
        .await;
    let _ = docker
        .remove_container(
            &staging_id,
            Some(RemoveContainerOptions { force: true, ..Default::default() }),
        )
        .await;

    result
}

async fn build_inner(
    docker: &Docker,
    staging_id: &str,
    conn_str: &str,
    method: &SnapshotMethod,
    project_name: &str,
    on_progress: &(impl Fn(String) + Send),
) -> Result<BaseImage, String> {
    let pg_version: u32 = 16;

    match method {
        SnapshotMethod::PgDump | SnapshotMethod::SchemaOnly => {
            on_progress("Initializing database cluster…".to_string());
            exec_capture(
                docker,
                staging_id,
                vec![
                    "initdb".to_string(),
                    "-D".to_string(),
                    "/pgdata".to_string(),
                    "-U".to_string(),
                    "postgres".to_string(),
                    "--no-locale".to_string(),
                    "-E".to_string(),
                    "UTF8".to_string(),
                ],
                None,
                on_progress,
            )
            .await?;

            exec_capture(
                docker,
                staging_id,
                vec![
                    "sh".to_string(),
                    "-c".to_string(),
                    "printf 'local all all trust\\nhost all all 0.0.0.0/0 trust\\n' \
                     > /pgdata/pg_hba.conf"
                        .to_string(),
                ],
                None,
                on_progress,
            )
            .await?;

            on_progress("Starting postgres…".to_string());
            exec_capture(
                docker,
                staging_id,
                vec![
                    "pg_ctl".to_string(),
                    "start".to_string(),
                    "-D".to_string(),
                    "/pgdata".to_string(),
                    "-o".to_string(),
                    "-p 5432 -c listen_addresses=*".to_string(),
                ],
                None,
                on_progress,
            )
            .await?;
            wait_pg_ready(docker, staging_id).await?;

            let dump_flag = if *method == SnapshotMethod::SchemaOnly {
                "--schema-only"
            } else {
                ""
            };
            let pipeline = if dump_flag.is_empty() {
                format!(
                    "pg_dump '{conn_str}' | psql 'postgresql://postgres@127.0.0.1:5432/postgres'"
                )
            } else {
                format!(
                    "pg_dump {dump_flag} '{conn_str}' | psql 'postgresql://postgres@127.0.0.1:5432/postgres'"
                )
            };
            on_progress("Importing data — this may take a minute…".to_string());
            exec_capture(
                docker,
                staging_id,
                vec!["sh".to_string(), "-c".to_string(), pipeline],
                None,
                on_progress,
            )
            .await?;

            exec_capture(
                docker,
                staging_id,
                vec![
                    "pg_ctl".to_string(),
                    "stop".to_string(),
                    "-D".to_string(),
                    "/pgdata".to_string(),
                    "-m".to_string(),
                    "fast".to_string(),
                ],
                None,
                on_progress,
            )
            .await?;
        }

        SnapshotMethod::BaseBackup => {
            let (host, port, user, password) = parse_pg_url(conn_str)?;
            on_progress(format!("Streaming base backup from {host}:{port}…"));
            let env = password.map(|p| vec![format!("PGPASSWORD={p}")]);
            exec_capture(
                docker,
                staging_id,
                vec![
                    "pg_basebackup".to_string(),
                    "-h".to_string(),
                    host,
                    "-p".to_string(),
                    port.to_string(),
                    "-U".to_string(),
                    user,
                    "-D".to_string(),
                    "/pgdata".to_string(),
                    "-Fp".to_string(),
                    "-Xs".to_string(),
                    "-c".to_string(),
                    "fast".to_string(),
                    "--no-password".to_string(),
                ],
                env,
                on_progress,
            )
            .await?;
        }
    }

    prewarm(docker, staging_id, on_progress).await?;
    tune(docker, staging_id).await?;

    // Commit the staged container as the base image
    let image_id = uuid::Uuid::new_v4().to_string().replace('-', "");
    let raw: String = project_name.to_lowercase().chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let slug = raw.trim_matches('-');
    let slug = if slug.is_empty() { "project" } else { slug };
    let image_name = format!("tempest-db-base-{slug}-{image_id}");
    on_progress(format!("Committing base image {image_name}…"));
    docker
        .commit_container(
            CommitContainerOptions {
                container: staging_id,
                repo: image_name.as_str(),
                tag: "latest",
                ..Default::default()
            },
            Config::<String>::default(),
        )
        .await
        .map_err(|e| e.to_string())?;

    // Get image size from inspect
    let size_bytes = docker
        .inspect_image(&image_name)
        .await
        .map(|i| i.size.unwrap_or(0) as u64)
        .unwrap_or(0);

    let now = {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs().to_string())
            .unwrap_or_else(|_| "0".to_string())
    };

    on_progress("Base image ready.".to_string());
    Ok(BaseImage {
        id: image_id,
        image_name,
        pg_version,
        method: method.clone(),
        size_bytes,
        created_at: now,
    })
}

pub async fn branch_create(
    image_name: &str,
    branch_name: &str,
    port: u16,
) -> Result<DbBranch, String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;

    let container_name = format!("tempest-{branch_name}");
    let mut port_bindings: HashMap<String, Option<Vec<PortBinding>>> = HashMap::new();
    port_bindings.insert(
        "5432/tcp".to_string(),
        Some(vec![PortBinding {
            host_ip: Some("127.0.0.1".to_string()),
            host_port: Some(port.to_string()),
        }]),
    );
    let mut exposed_ports: HashMap<&str, HashMap<(), ()>> = HashMap::new();
    exposed_ports.insert("5432/tcp", HashMap::new());

    let create_resp = docker
        .create_container(
            Some(CreateContainerOptions {
                name: container_name.as_str(),
                platform: None,
            }),
            Config {
                image: Some(image_name),
                exposed_ports: Some(exposed_ports),
                host_config: Some(HostConfig {
                    port_bindings: Some(port_bindings),
                    // On Linux, Docker Desktop doesn't auto-provide host.docker.internal
                    extra_hosts: if cfg!(target_os = "linux") {
                        Some(vec!["host.docker.internal:host-gateway".to_string()])
                    } else {
                        None
                    },
                    ..Default::default()
                }),
                ..Default::default()
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    docker
        .start_container(
            &create_resp.id,
            None::<bollard::container::StartContainerOptions<String>>,
        )
        .await
        .map_err(|e| e.to_string())?;

    wait_pg_ready(&docker, &create_resp.id).await?;

    let connection_string = format!(
        "postgresql://postgres@127.0.0.1:{port}/postgres"
    );

    Ok(DbBranch {
        name: branch_name.to_string(),
        container_id: create_resp.id,
        port,
        connection_string,
        created_at: String::new(),
    })
}

pub async fn branch_delete(container_id: &str) -> Result<(), String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    // stop is best-effort — container may already be stopped
    let _ = docker
        .stop_container(container_id, Some(StopContainerOptions { t: 5 }))
        .await;
    docker
        .remove_container(
            container_id,
            Some(RemoveContainerOptions { force: true, ..Default::default() }),
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
