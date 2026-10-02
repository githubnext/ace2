import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = `http://127.0.0.1:${process.env.ACE_PORT || 4140}`;

export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: { port: 1111, proxy: { "/ws": { target: host, ws: true } } },
});
