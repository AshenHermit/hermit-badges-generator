import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { GenerateQueryDto } from './dto/generate-query.dto';
import { GenerationService } from './generation.service';

const GOLDEN_PATH = path.resolve(process.cwd(), 'test/golden/hermit-frame.png');

describe('golden PNG', () => {
  let moduleRef: TestingModule;
  let service: GenerationService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    service = moduleRef.get(GenerationService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('matches the committed hermit-frame PNG byte for byte', async () => {
    const query = new GenerateQueryDto();
    query.left = 'Hello';
    query.right = 'World';
    query.style = 'hermit-frame';
    query.format = 'png';

    const actual = await service.generate(query);
    const expected = fs.readFileSync(GOLDEN_PATH);

    expect(actual.equals(expected)).toBe(true);
  });
});
