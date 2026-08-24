const root = document.getElementById("root");
const semanticHost = new URLSearchParams(window.location.search).get("semanticHost") === "1";

if (semanticHost) {
  root.hidden = true;
  root.textContent = "Daytrace local semantic analysis";
  import("./semantic-analysis-client.js").then(({ runSemanticAnalysis }) => {
    window.daytrace?.onSemanticAnalysisRequested(() => void runSemanticAnalysis(window.daytrace).catch(() => {}));
    window.__daytraceSemanticHostReady = true;
  });
} else {
  root.textContent = "Loading Daytrace…";
  import("./theme.js").then(({ bootstrapTheme }) => {
    bootstrapTheme();
    return import("./app-entry.jsx");
  });
}
