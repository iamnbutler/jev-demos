import { Component, lazy, Suspense, useEffect, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router";
import { demos, type Demo } from "./lib/catalog";
import { useHealth } from "./lib/health";
import Gallery from "./components/Gallery";
import { Button } from "./components/ui";

const ActionsDemo = lazy(() => import("./demos/actions/ActionsDemo"));
const CodeSearchDemo = lazy(() => import("./demos/code/CodeSearchDemo"));
const ReviewDemo = lazy(() => import("./demos/code/ReviewDemo"));
const DuplicateDemo = lazy(() => import("./demos/duplicates/DuplicateDemo"));
const DiscussionDemo = lazy(() => import("./demos/discussion/DiscussionDemo"));
const HistoryDemo = lazy(() => import("./demos/code/HistoryDemo"));
const ContextDemo = lazy(() => import("./demos/agents/ContextDemo"));
const ReplayDemo = lazy(() => import("./demos/agents/ReplayDemo"));
const components = {
  actions: ActionsDemo,
  "code-search": CodeSearchDemo,
  review: ReviewDemo,
  duplicates: DuplicateDemo,
  discussion: DiscussionDemo,
  history: HistoryDemo,
  context: ContextDemo,
  replay: ReplayDemo,
};

class DemoErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="panel error-boundary">
          <h2>This demo hit an error.</h2>
          <p>Reload to reset the example.</p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      );
    return this.props.children;
  }
}

function Experiment({ demo }: { demo: Demo }) {
  const View = components[demo.id];
  return (
    <div className={"experiment experiment-" + demo.id}>
      <header className="experiment-heading">
        <h1>{demo.title}</h1>
        <p>{demo.description}</p>
      </header>
      <DemoErrorBoundary key={demo.id}>
        <Suspense
          fallback={
            <div className="demo-loading">
              <LoaderCircle className="spin" size={18} /> Loading…
            </div>
          }
        >
          <View />
        </Suspense>
      </DemoErrorBoundary>
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = demos.find((demo) => "/" + demo.id === pathname);
  const { health, error } = useHealth();
  useEffect(() => {
    document.title = current ? current.title + " · Jev demos" : "Jev demos";
    window.scrollTo(0, 0);
  }, [current]);
  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <NavLink to="/" end className="site-name">
          Jev demos
        </NavLink>
        <nav className="site-nav" aria-label="Demos">
          {demos.map((demo) => (
            <NavLink
              key={demo.id}
              to={"/" + demo.id}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {demo.shortTitle}
            </NavLink>
          ))}
        </nav>
        <label className="mobile-navigation">
          <span className="sr-only">Demo</span>
          <select
            aria-label="Choose demo"
            value={current?.id ?? ""}
            onChange={(e) => navigate(e.target.value ? "/" + e.target.value : "/")}
          >
            <option value="">Index</option>
            {demos.map((demo) => (
              <option value={demo.id} key={demo.id}>
                {demo.title}
              </option>
            ))}
          </select>
        </label>
        <span className="site-status">
          {error
            ? "API unavailable"
            : health
              ? health.jev.configured
                ? health.jev.model
                : "Jev key missing"
              : "Connecting…"}
        </span>
      </header>
      <main id="main">
        <Routes>
          <Route path="/" element={<Gallery />} />
          {demos.map((demo) => (
            <Route
              key={demo.id}
              path={"/" + demo.id}
              element={<Experiment key={demo.id} demo={demo} />}
            />
          ))}
          <Route
            path="*"
            element={
              <div className="not-found">
                <h1>Page not found</h1>
                <Link to="/">Back to demos</Link>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
