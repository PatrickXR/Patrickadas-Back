import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { patchNestJsSwagger } from 'nestjs-zod';
import { writeFileSync } from 'node:fs';
import { AppModule } from './app.module';
import { configureApplication } from './configure-app';

async function generate(): Promise<void> {
  patchNestJsSwagger();
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    configureApplication(app);
    const config = new DocumentBuilder().setTitle('Patrickadas').setVersion('1').addBearerAuth().build();
    writeFileSync('openapi.json', JSON.stringify(SwaggerModule.createDocument(app, config), null, 2));
  } finally { await app.close(); }
}

void generate();
