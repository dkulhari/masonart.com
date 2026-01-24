/**
 * Client Entry Point
 *
 * Hydrates the React application on the client side.
 *
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/client-entry-point
 */

/// <reference types="vite/client" />

import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'

// Hydrate the application
hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
)
