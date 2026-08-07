const http = require("http");

function makeRequest() {
  const data = JSON.stringify({});
  const options = {
    hostname: "127.0.0.1",
    port: 3001,
    path: "/api/v1/admin/seed",
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": data.length },
  };

  const req = http.request(options, (res) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => {
      console.log("Status:", res.statusCode);
      console.log("Response:", body);
    });
  });
  req.on("error", (e) => console.error("Error:", e.message));
  req.write(data);
  req.end();
}

makeRequest();
