"use client";

import { useMutation } from "convex/react";
import { api } from "@redux/backend/convex/_generated/api";
import { useEffect } from "react";
import { useQuery } from "@/lib/hooks/convex";

export function TestClient() {
    const testMutation = useMutation(api.functions.user.testMutation);
    const testQuery = useQuery(api.functions.user.testQuery);

    useEffect(() => console.log(testQuery), [testQuery]);

    return (
        <button onClick={async () => {
            console.log(await testMutation())
        }}>Test</button>
    );
}