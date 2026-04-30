declare module "@tanstack/react-start/api" {
  export type StartAPIMethodCallback<_Path extends string = string> = (ctx: {
    request: Request;
    params: Record<string, string>;
  }) => Response | Promise<Response>;
}
