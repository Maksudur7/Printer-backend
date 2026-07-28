import { Test, TestingModule } from '@nestjs/testing';
import { KioskController } from './kiosk.controller';
import { KioskService } from './kiosk.service';

describe('KioskController', () => {
  let controller: KioskController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KioskController],
      providers: [KioskService],
    }).compile();

    controller = module.get<KioskController>(KioskController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
