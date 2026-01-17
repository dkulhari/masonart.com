/**
 * Client Entry Point
 *
 * Hydrates the React application on the client side.
 *
 * @see https://tanstack.com/router/latest/docs/framework/react/start/getting-started
 */

/// <reference types="vite/client" />

import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'

// Hydrate the application
hydrateRoot(document, <StartClient />)
