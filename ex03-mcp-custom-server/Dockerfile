# mcp-echo — containerized MCP stdio server.
# node:24 executes .ts files directly (default type stripping, erasable
# syntax only) so no build step and no npm dependencies are needed.
# Build from this directory:  docker build -t mcp-ex03-echo:local .
FROM node:24-alpine
WORKDIR /app
COPY server.ts .
# Run as the non-root user provided by the base image
USER node
ENTRYPOINT ["node", "server.ts"]
