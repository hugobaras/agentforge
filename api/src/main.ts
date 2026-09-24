import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp } from './common/setup-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupApp(app);
  const port = process.env.API_PORT ?? process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
