import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="font-display text-7xl font-bold text-muted">404</p>
        <h1 className="mt-2 text-2xl font-bold">This page doesn't exist</h1>
        <p className="mt-2 text-muted">Check the address, or go back to your workspace.</p>
        <Button className="mt-6" asChild><Link to="/">Go to workspace</Link></Button>
      </div>
    </div>
  );
}
