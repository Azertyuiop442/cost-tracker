
export function workspaceMatches(sessionWs: string | undefined, currentWs: string): boolean {
  const sws = (sessionWs || "").replace(/\/$/, "");
  const ws = (currentWs || "").replace(/\/$/, "");
  if (ws === "" || sws === "") return false;
  return sws === ws || sws.startsWith(ws + "/");
}

