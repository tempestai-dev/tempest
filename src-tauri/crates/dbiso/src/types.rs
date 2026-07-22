#[derive(Debug, Clone, PartialEq)]
pub enum SnapshotMethod {
    BaseBackup,
    PgDump,
    SchemaOnly,
}

impl SnapshotMethod {
    pub fn from_str(s: &str) -> Self {
        match s {
            "schema-only" => Self::SchemaOnly,
            "pgdump" => Self::PgDump,
            _ => Self::BaseBackup,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::BaseBackup => "basebackup",
            Self::PgDump => "pgdump",
            Self::SchemaOnly => "schema-only",
        }
    }
}

#[derive(Debug, Clone)]
pub struct BaseImage {
    pub id: String,
    pub image_name: String,
    pub pg_version: u32,
    pub method: SnapshotMethod,
    pub size_bytes: u64,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DbBranch {
    pub name: String,
    pub container_id: String,
    pub port: u16,
    pub connection_string: String,
    pub created_at: String,
}
