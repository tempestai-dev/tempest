mod db;
mod docker;
mod types;

pub use types::{BaseImage, DbBranch, SnapshotMethod};

pub async fn check_docker_available() -> bool {
    docker::check_docker().await
}

pub fn get_current_base_image(workspace_path: &str) -> Option<BaseImage> {
    db::get_current_base_image(workspace_path)
}

pub async fn build_base_image(
    conn_str: &str,
    method: SnapshotMethod,
    workspace_path: &str,
    project_name: &str,
    on_progress: impl Fn(String) + Send + 'static,
) -> Result<BaseImage, String> {
    let img = docker::build_base_image(conn_str, method, project_name, on_progress).await?;
    db::insert_base_image(&img, workspace_path).map_err(|e| e.to_string())?;
    Ok(img)
}

pub async fn branch_create(name: &str, workspace_path: &str) -> Result<DbBranch, String> {
    let img = db::get_current_base_image(workspace_path).ok_or("no base image — run setup first")?;
    let port = next_free_port();
    let branch = docker::branch_create(&img.image_name, name, port).await?;
    db::insert_branch(&branch, workspace_path).map_err(|e| e.to_string())?;
    Ok(branch)
}

pub fn all_branches(workspace_path: &str) -> Vec<DbBranch> {
    db::all_branches(workspace_path)
}

pub async fn sweep_orphans() -> Result<(), String> {
    for b in db::all_branches_global() {
        let _ = docker::branch_delete(&b.container_id).await;
        let _ = db::remove_branch(&b.name);
    }
    Ok(())
}

pub async fn branch_delete(name: &str) -> Result<(), String> {
    if let Some(branch) = db::get_branch(name) {
        docker::branch_delete(&branch.container_id).await?;
        db::remove_branch(name).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn next_free_port() -> u16 {
    let used = db::used_ports();
    (15432u16..=65000).find(|p| !used.contains(p)).unwrap_or(15432)
}
