function compactRendererState(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const { sessions: _sessions, brief: _brief, ...compact } = source;
  return { ...compact, sessions: [], brief: null };
}

module.exports = { compactRendererState };
