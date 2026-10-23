# syntax=docker/dockerfile:1
FROM rust:1-slim AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --no-create-home kp
COPY --from=build /src/target/release/kp-server /usr/local/bin/kp-server
USER kp
ENV PORT=8080 RUST_LOG=kp_server=info,tower_http=info
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD curl -fsS http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["kp-server"]
