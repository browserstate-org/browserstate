import * as path from 'path';

interface GCSConfig {
  userId: string;
  projectID: string;
  bucketName: string;
  serviceAccountPath: string;
}

// Configuration for GCS access
export const config: GCSConfig = {
  userId: 'your_user_id',
  projectID: 'your_gcp_project_id', 
  bucketName: 'your_bucket_name', 
  serviceAccountPath: path.join(__dirname, 'service-account.json'),
}; 