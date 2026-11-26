import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* En développement, deux processus tournent : Vite sert l'interface sur 5173,
 * le registre répond sur 4321. Le mandataire fait croire au navigateur qu'il
 * n'y en a qu'un.
 *
 * Ce n'est pas qu'un confort. Le cookie de session est posé sur l'origine de
 * la réponse : sans mandataire, il viendrait de localhost:4321 et ne serait
 * jamais renvoyé par la page servie depuis localhost:5173. On passerait alors
 * son temps à déboguer une authentification qui « ne tient pas », alors
 * qu'elle fonctionne, et en production, où nginx sert tout depuis la même
 * origine, le problème n'existe pas.
 *
 * https://vite.dev/config/
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VIZDATA_API || 'http://localhost:4321',
        changeOrigin: false,
      },
    },
  },
})
