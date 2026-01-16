/**
 * Setup script to create the test database if it doesn't exist
 */

import postgres from 'postgres';

async function setupTestDatabase() {
  console.log('Setting up test database...');

  // Connect to the default database first
  const defaultDb = postgres({
    host: 'localhost',
    port: 5433,
    database: 'poster_app_dev',
    username: 'poster_app',
    password: 'dev_password',
  });

  try {
    // Check if test database exists
    const result = await defaultDb`
      SELECT 1 FROM pg_database WHERE datname = 'poster_app_test'
    `;

    if (result.length === 0) {
      console.log('Creating poster_app_test database...');
      await defaultDb.unsafe('CREATE DATABASE poster_app_test');
      console.log('✅ Test database created successfully');
    } else {
      console.log('✅ Test database already exists');
    }
  } catch (error) {
    console.error('Error setting up test database:', error);
    throw error;
  } finally {
    await defaultDb.end();
  }
}

// Run the setup
setupTestDatabase()
  .then(() => {
    console.log('Test database setup complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to setup test database:', error);
    process.exit(1);
  });
