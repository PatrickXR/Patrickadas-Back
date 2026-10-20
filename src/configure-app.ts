import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';

export function configureApplication(app: INestApplication): void {
  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'v1/health', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
    credentials: true,
  });
}
