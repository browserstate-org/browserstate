interface S3Config {
  userId: string;
  bucketName: string;
  region: string;
}

// Configuration for S3 access
export const config: S3Config = {
  userId: 'demo_user',
  bucketName: 'my-sessions',
  region: 'us-west-2'
}; 