mod db;
mod docker;
mod types;

pub use types::{BaseImage, DbBranch, SnapshotMethod};

pub async fn check_docker_available() -> bool {
    docker::check_docker().await
}

pub fn get_current_base_image() -> Option<BaseImage> {
    db::get_current_base_image()
}

pub async fn build_base_image(
    conn_str: &str,
    method: SnapshotMethod,
    on_progress: impl Fn(String) + Send + 'static,
) -> Result<BaseImage, String> {
    let img = docker::build_base_image(conn_str, method, on_progress).await?;
    db::insert_base_image(&img).map_err(|e| e.to_string())?;
    Ok(img)
}

pub async fn branch_create(name: &str) -> Result<DbBranch, String> {
    let img = db::get_current_base_image().ok_or("no base image — run setup first")?;
    let port = next_free_port();
    let branch = docker::branch_create(&img.image_name, name, port).await?;
    db::insert_branch(&branch).map_err(|e| e.to_string())?;
    Ok(branch)
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
