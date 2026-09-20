type SecretStore = {
  getSecret(id: string): string | null;
  setSecret(id: string, secret: string): void;
};

export function storeOllamaHeadersSecret(headers: string, secrets: SecretStore): string {
  const baseId = 'akaire-ollama-headers';
  let id = baseId;
  let suffix = 2;
  let existing = secrets.getSecret(id);
  while (existing !== null && existing !== headers) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
    existing = secrets.getSecret(id);
  }
  if (existing === null) secrets.setSecret(id, headers);
  return id;
}
