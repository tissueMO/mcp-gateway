import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * .env ファイルを解析して環境変数をロードします。
 */
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

async function main() {
  loadEnv();

  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const userPoolDomain = process.env.COGNITO_DOMAIN;
  const clientCallbackUrl = process.env.CLIENT_CALLBACK_URL;
  const targetsParameterName = process.env.TARGETS_PARAMETER_NAME || '/mcp-gateway/targets';
  const domainName = process.env.DOMAIN_NAME;
  const hostedZoneId = process.env.HOSTED_ZONE_ID;
  const certificateArn = process.env.CERTIFICATE_ARN;

  if (!userPoolId || !userPoolDomain || !clientCallbackUrl || !domainName || !hostedZoneId || !certificateArn) {
    console.error('エラー: .env に必要な設定項目が不足しています。');
    console.error('.env.example を参考に必要な環境変数を設定してください。');
    process.exit(1);
  }

  const chatGptCallbackUrl = process.env.CHATGPT_CALLBACK_URL;

  const overrideList = [
    `UserPoolId="${userPoolId}"`,
    `UserPoolDomain="${userPoolDomain}"`,
    `ClientCallbackUrl="${clientCallbackUrl}"`,
    `TargetsParameterName="${targetsParameterName}"`,
    `DomainName="${domainName}"`,
    `HostedZoneId="${hostedZoneId}"`,
    `CertificateArn="${certificateArn}"`,
  ];

  if (chatGptCallbackUrl) {
    overrideList.push(`ChatGptCallbackUrl="${chatGptCallbackUrl}"`);
  }

  const overrides = overrideList.join(' ');

  const s3Bucket = process.env.SAM_S3_BUCKET ? `--s3-bucket ${process.env.SAM_S3_BUCKET}` : '--resolve-s3';
  const deployCmd = `sam deploy ${s3Bucket} --parameter-overrides ${overrides}`;

  console.log('Deploying SAM application with parameter overrides...');
  execSync(deployCmd, { stdio: 'inherit' });
}

main().catch((err) => {
  console.error('Deploy failed:', err);
  process.exit(1);
});
