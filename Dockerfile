FROM ubuntu:focal
ENV WORKDIR=/workspace
WORKDIR $WORKDIR
COPY app.js package.json $WORKDIR/
RUN apt update ; DEBIAN_FRONTEND=noninteractive apt install -y redis npm git ; npm install ;
CMD bash -c "redis-server 2>&1 & node app.js -p 5353 -d dns.google.com -t 3600000"
