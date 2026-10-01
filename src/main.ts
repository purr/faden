import '@fontsource/atkinson-hyperlegible-mono/400.css';
import '@fontsource/atkinson-hyperlegible-mono/400-italic.css';
import '@fontsource/atkinson-hyperlegible-mono/500.css';
import '@fontsource/atkinson-hyperlegible-mono/700.css';
import '@fontsource/atkinson-hyperlegible-next/400.css';
import '@fontsource/atkinson-hyperlegible-next/400-italic.css';
import '@fontsource/atkinson-hyperlegible-next/600.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { installErrorHandlers, loadLog } from './lib/debug.svelte';

// first, so even an error while starting up lands in the copyable debug report
installErrorHandlers();
void loadLog();

mount(App, { target: document.getElementById('app')! });
