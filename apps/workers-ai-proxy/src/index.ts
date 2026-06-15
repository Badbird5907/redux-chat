export default {
  fetch: async (request: Request) => {
    return new Response(request.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  },
}