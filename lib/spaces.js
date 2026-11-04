// lib/spaces.js — DigitalOcean Spaces (S3-compatible) upload and presigned URL helpers
//
// Presigned GET URLs are generated against the S3 API endpoint (DO_SPACES_ENDPOINT),
// not the CDN hostname. CDN may be enabled for general performance but private objects
// must be accessed via signed S3 URLs only.
//
// Environment variables required:
//   DO_SPACES_KEY      — Spaces access key ID
//   DO_SPACES_SECRET   — Spaces secret access key
//   DO_SPACES_REGION   — e.g. nyc3
//   DO_SPACES_BUCKET   — e.g. cernly-screenshots
//   DO_SPACES_ENDPOINT — S3 API endpoint, e.g. https://nyc3.digitaloceanspaces.com

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

let _client = null;

function getClient() {
  if (_client) return _client;
  const endpoint = process.env.DO_SPACES_ENDPOINT;
  const region   = process.env.DO_SPACES_REGION;
  const key      = process.env.DO_SPACES_KEY;
  const secret   = process.env.DO_SPACES_SECRET;

  if (!endpoint || !region || !key || !secret) {
    throw new Error('[spaces] Missing required env vars: DO_SPACES_ENDPOINT, DO_SPACES_REGION, DO_SPACES_KEY, DO_SPACES_SECRET');
  }

  _client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    // DO Spaces is S3-compatible but not AWS; force path-style so the SDK
    // doesn't attempt to prepend the bucket name to the AWS hostname.
    forcePathStyle: false,
  });
  return _client;
}

function getBucket() {
  const bucket = process.env.DO_SPACES_BUCKET;
  if (!bucket) throw new Error('[spaces] DO_SPACES_BUCKET is not set');
  return bucket;
}

/**
 * Upload a screenshot buffer to Spaces with private ACL.
 *
 * @param {string} key         - Object key, e.g. "screenshots/abc123-reportId.jpg"
 * @param {Buffer} buffer      - Validated image buffer
 * @param {string} contentType - Validated MIME type, e.g. "image/jpeg"
 * @returns {Promise<void>}
 */
export async function uploadScreenshot(key, buffer, contentType) {
  const client = getClient();
  const bucket = getBucket();

  await client.send(new PutObjectCommand({
    Bucket:      bucket,
    Key:         key,
    Body:        buffer,
    ContentType: contentType,
    ACL:         'private',
  }));

  console.log(`[spaces] uploaded ${key} (${buffer.byteLength} bytes, ${contentType})`);
}

/**
 * Generate a presigned GET URL for a private Spaces object.
 * Uses the S3 API endpoint — not the CDN hostname.
 *
 * @param {string} key              - Object key stored in the DB
 * @param {number} [expiresIn=3600] - TTL in seconds (default 1 hour)
 * @returns {Promise<string>}       - Presigned HTTPS URL
 */
export async function getPresignedUrl(key, expiresIn = 3600) {
  const client  = getClient();
  const bucket  = getBucket();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const url     = await getSignedUrl(client, command, { expiresIn });
  return url;
}

/**
 * Delete a Spaces object (used when replacing a screenshot on rescan).
 * Errors are logged but not thrown — deletion failure must not block report access.
 *
 * @param {string} key - Object key to delete
 */
export async function deleteScreenshot(key) {
  try {
    const client = getClient();
    const bucket = getBucket();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    console.log(`[spaces] deleted ${key}`);
  } catch (e) {
    console.error(`[spaces] delete failed for ${key}:`, e.message);
  }
}
