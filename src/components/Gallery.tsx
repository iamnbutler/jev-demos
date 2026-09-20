import { Link } from "react-router";
import { demos } from "../lib/catalog";

const inputs = [
  "YAML",
  "TypeScript",
  "Diff",
  "Reports",
  "Thread",
  "Commits",
  "Transcript",
  "Trace",
];

export default function Gallery() {
  return (
    <div className="hub">
      <header className="hub-heading">
        <h1>Demos</h1>
        <p>Eight uses for Jev. Choose one to try.</p>
      </header>
      <div className="hub-list" aria-label="Jev demos">
        <div className="hub-labels">
          <span>Demo</span>
          <span>What it does</span>
          <span>Input</span>
        </div>
        {demos.map((demo, index) => (
          <Link to={"/" + demo.id} key={demo.id} className="hub-row">
            <span className="hub-name">{demo.title}</span>
            <span className="hub-description">{demo.description}</span>
            <span className="hub-input">{inputs[index]}</span>
          </Link>
        ))}
      </div>
      <p className="hub-footnote">
        Fictional examples, live judgments. Inputs and answers are inspectable in every demo.
      </p>
    </div>
  );
}
