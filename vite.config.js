import {defineConfig} from 'vite';
export default defineConfig({base:'./',server:{host:'127.0.0.1',port:5198,strictPort:true},build:{rollupOptions:{input:{main:'index.html',helmet:'capacete-senna-1991.html'}},outDir:'dist',emptyOutDir:true}});
