FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json .
RUN npm ci
COPY . .
ARG VITE_API_KEY=""
ENV VITE_API_KEY=$VITE_API_KEY
# The UI reads telemetry from this origin at runtime; without it the build
# falls back to the dev default of http://localhost:8000.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# nginx:alpine renders /etc/nginx/templates/*.template with envsubst at start,
# but only for variables that are defined, so this must exist even when empty.
ENV AGENTPULSE_API_KEY=""
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
