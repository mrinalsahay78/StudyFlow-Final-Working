import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Compass } from "lucide-react";
import Button from "../components/ui/Button";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="notfound">
      <div className="card">
        <div className="empty">
          <span className="empty-icon">
            <Compass size={22} />
          </span>
          <div>
            <h4>That page does not exist</h4>
            <p>The link may be old, or the page may have moved.</p>
          </div>
        </div>
        <div className="row">
          <Button variant="primary" iconRight={ArrowRight} onClick={() => navigate("/app")}>
            Go to dashboard
          </Button>
          <Link className="btn btn-ghost" to="/">
            <span>Back to the homepage</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
