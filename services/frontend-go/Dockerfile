FROM golang:1.15.1-alpine3.12 AS builder 
COPY main.go . 
RUN go build -o /main 

FROM alpine:edge 
RUN apk add --no-cache docker-cli 
ENV PORT 8080 
WORKDIR /app 
COPY --from=builder /main . 
ENTRYPOINT /app/main
