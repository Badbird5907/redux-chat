import { Link } from "@tanstack/react-router";

export function ReduxChatBrand() {
  return (
    <div className="mb-8 flex justify-center">
      <Link to="/" className="inline-block text-3xl font-bold md:text-4xl">
        <h1>
          <span className="font-audiowide">Redux.chat</span>
        </h1>
      </Link>
    </div>
  );
}
