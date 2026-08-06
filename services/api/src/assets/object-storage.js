import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export class S3ObjectStorage {
  constructor({ bucket, region, endpoint, forcePathStyle = false, expiresInSeconds = 900 }) {
    if (!bucket || !region) throw new Error("S3_BUCKET and S3_REGION are required.");
    this.bucket = bucket;
    this.expiresInSeconds = expiresInSeconds;
    this.client = new S3Client({ region, endpoint: endpoint || undefined, forcePathStyle });
  }
  async createUploadUrl({ key, mimeType, sizeBytes, checksumSha256 }) {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType, ContentLength: Number(sizeBytes), ...(checksumSha256 ? { ChecksumSHA256: checksumSha256 } : {}) });
    return getSignedUrl(this.client, command, { expiresIn: this.expiresInSeconds });
  }
  async createDownloadUrl(key) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: this.expiresInSeconds });
  }
  async inspectObject(key) {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: Number(result.ContentLength), mimeType: result.ContentType, checksumSha256: result.ChecksumSHA256 ?? null };
    } catch (error) {
      if (error?.name === "NotFound" || error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  }
  async downloadToFile(key, filePath) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    await pipeline(result.Body, createWriteStream(filePath, { flags: "wx" }));
  }
  async uploadFile({ key, filePath, mimeType }) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: createReadStream(filePath), ContentType: mimeType }));
  }
}

export class InMemoryObjectStorage {
  constructor() { this.objects = new Map(); }
  async createUploadUrl({ key }) { return `memory://upload/${encodeURIComponent(key)}`; }
  async createDownloadUrl(key) { return `memory://download/${encodeURIComponent(key)}`; }
  async inspectObject(key) { return this.objects.get(key) ?? null; }
  putObject(key, metadata) { this.objects.set(key, metadata); }
}
