/**
 * Client Entry Point
 *
 * Hydrates the React application on the client side.
 * Sets up the router and starts the application.
 *
 * @see https://tanstack.com/router/latest/docs/framework/react/start/getting-started
 */

/// <reference types="vite/client" />

import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
import { createRouter } from './router'

// Create router instance
const router = createRouter()

// Hydrate the application
hydrateRoot(document, <StartClient router={router} />)
