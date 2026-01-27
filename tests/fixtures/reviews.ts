/**
 * Test Fixtures for Reviews
 *
 * Provides reusable test data for review-related tests
 */

export interface ReviewAuthor {
  id: string;
  name: string | null;
  email: string;
}

export interface ReviewProduct {
  id: string;
  title: string;
  slug: string;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  title: string | null;
  content: string;
  status: 'pending' | 'approved' | 'rejected';
  moderatorId: string | null;
  moderatorNotes: string | null;
  createdAt: string;
  updatedAt: string;
  author?: ReviewAuthor | null;
  product?: ReviewProduct | null;
}

export interface ReviewStats {
  pending: number;
  approved: number;
  rejected: number;
  today: number;
  averageRating: number;
  total: number;
}

// ============================================================================
// Mock Reviews Data
// ============================================================================

export const mockReviews: Omit<Review, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    productId: '00000000-0000-0000-0000-000000000001',
    userId: 'test-user-1',
    rating: 5,
    title: 'Absolutely stunning!',
    content: 'This poster exceeded my expectations. The print quality is excellent and the colors are vibrant. Highly recommend!',
    status: 'approved',
    moderatorId: null,
    moderatorNotes: null,
  },
  {
    productId: '00000000-0000-0000-0000-000000000001',
    userId: 'test-user-2',
    rating: 4,
    title: 'Great value for money',
    content: 'Good quality poster at a reasonable price. Shipping was fast too.',
    status: 'approved',
    moderatorId: null,
    moderatorNotes: null,
  },
  {
    productId: '00000000-0000-0000-0000-000000000001',
    userId: 'test-user-3',
    rating: 3,
    title: 'Decent poster',
    content: 'The poster is okay, but the colors are slightly different from the website.',
    status: 'approved',
    moderatorId: null,
    moderatorNotes: null,
  },
  {
    productId: '00000000-0000-0000-0000-000000000001',
    userId: 'test-user-4',
    rating: 1,
    title: 'Poor quality',
    content: 'This is spam content.',
    status: 'pending',
    moderatorId: null,
    moderatorNotes: null,
  },
  {
    productId: '00000000-0000-0000-0000-000000000002',
    userId: 'test-user-5',
    rating: 4,
    title: 'Nice artwork',
    content: 'The artwork looks great but arrived with a slight crease.',
    status: 'rejected',
    moderatorId: 'admin-user-1',
    moderatorNotes: 'Contains misleading claims about delivery',
  },
];

// ============================================================================
// Test Review Content
// ============================================================================

export const validReviewContent = {
  short: {
    rating: 5,
    title: 'Great!',
    content: 'Love it! Perfect for my living room.',
  },
  medium: {
    rating: 4,
    title: 'Good product, minor issues',
    content: 'The poster quality is excellent and the print is very detailed. The only issue was that the packaging could have been better - there were some minor scratches on the surface. Overall, still a good purchase.',
  },
  long: {
    rating: 5,
    title: 'Best poster I have ever purchased!',
    content: 'I cannot say enough good things about this poster. The quality of the print is absolutely phenomenal - the colors are rich and vibrant, exactly as shown in the pictures. The paper quality is premium and has a nice matte finish. I ordered the framed version and the frame itself is sturdy and well-made. Shipping was super fast and the packaging was very secure. The poster arrived in perfect condition. I have already received so many compliments from friends and family. Will definitely be ordering more from this store!',
  },
};

export const invalidReviewContent = {
  noRating: {
    rating: 0,
    title: 'Test',
    content: 'Test review content.',
  },
  ratingTooHigh: {
    rating: 6,
    title: 'Test',
    content: 'Test review content.',
  },
  emptyContent: {
    rating: 5,
    title: 'Great poster',
    content: '',
  },
  tooShortContent: {
    rating: 5,
    title: 'Test',
    content: 'Hi',
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a random review for testing
 */
export function generateRandomReview(overrides: Partial<Review> = {}): Omit<Review, 'id' | 'createdAt' | 'updatedAt'> {
  const ratings = [1, 2, 3, 4, 5];
  const statuses: Review['status'][] = ['pending', 'approved', 'rejected'];

  return {
    productId: '00000000-0000-0000-0000-000000000001',
    userId: `user-${Math.random().toString(36).substring(7)}`,
    rating: ratings[Math.floor(Math.random() * ratings.length)],
    title: `Test Review ${Math.random().toString(36).substring(7)}`,
    content: `This is a test review content with some random text ${Math.random()}`,
    status: statuses[Math.floor(Math.random() * statuses.length)],
    moderatorId: null,
    moderatorNotes: null,
    ...overrides,
  };
}

/**
 * Generate multiple random reviews
 */
export function generateRandomReviews(count: number, overrides: Partial<Review> = {}): Omit<Review, 'id' | 'createdAt' | 'updatedAt'>[] {
  return Array.from({ length: count }, () => generateRandomReview(overrides));
}
