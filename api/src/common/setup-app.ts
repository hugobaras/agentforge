import { INestApplication, ValidationPipe } from '@nestjs/common';

export function setupApp(app: INestApplication): void {
  app.enableCors({ origin: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
