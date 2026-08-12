export async function onRequest(context) {
  return new Response(JSON.stringify({ status: 'ok', message: 'Functions is working!' }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
