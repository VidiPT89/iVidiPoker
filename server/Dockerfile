FROM node:22-alpine
WORKDIR /app
COPY package.json poker.js bot.js src.js ./
RUN mkdir /data && chown node:node /data
ENV DATA_FILE=/data/rooms.json
ENV PORT=8080
USER node
EXPOSE 8080
CMD ["node", "src.js"]
