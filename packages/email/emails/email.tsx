import * as React from "react";
import { Body, Button, Head, Html } from "@react-email/components";

export default function Email() {
  return (
    <Html>
      <Head />
      <Body>
        <Button
          href="https://example.com"
          style={{ background: "#0b0c10", color: "#fff", padding: "12px 20px" }}
        >
          Click me
        </Button>
      </Body>
    </Html>
  );
}
