import { invoke } from "@tauri-apps/api/core";
import type { Extension } from "./types";

export async function seedExtensions(): Promise<string[]> {
  return await invoke<string[]>("seed_extensions");
}

export async function listExtensions(): Promise<Extension[]> {
  return await invoke<Extension[]>("list_extensions");
}

export async function readExtensionFile(
  extensionId: string,
  relativePath: string
): Promise<string> {
  return await invoke<string>("read_extension_file", {
    extensionId,
    relativePath,
  });
}
