# Norma (RAG): imagen del servicio. Runtime directo con tsx (sin build step).
# El índice vectorial viene en data/; el índice y la jurisdicción se eligen al construir:
#   docker build --build-arg VECTOR_INDEX=<índice> --build-arg JURISDICCION=jurisdicciones/<id> .
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
# Ganan sobre el .env.local montado. Para otro índice sin reconstruir: -e VECTOR_INDEX=<índice> en el servicio.
ARG VECTOR_INDEX=normativa
ARG JURISDICCION=jurisdicciones/ejemplo
ENV VECTOR_INDEX=$VECTOR_INDEX
ENV JURISDICCION=$JURISDICCION
ENV PORT=8787
EXPOSE 8787
# Consultas, valoraciones y revisiones a mano: montar un volumen acá para que sobrevivan a cada despliegue.
ENV ESTADO_DIR=/app/estado

# El índice (data/<índice>.*) se copia con el contexto. /health verifica que esté cargado
# y devuelve jurisdiccion.id; sin la carpeta de la jurisdicción, el servicio no arranca.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://localhost:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "src/server.ts"]
