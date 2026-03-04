import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AUTH } from '@oracle/shared';
import { PrismaService } from '@prisma/prisma.service';
import { AuthService } from '@core/auth/auth.service';

const MOCK_PASSWORD = 'password123';
const MOCK_PASSWORD_HASH = bcrypt.hashSync(MOCK_PASSWORD, AUTH.BCRYPT_SALT_ROUNDS);

const MOCK_USER = {
  id: 'user-uuid-1',
  email: 'admin@besales.app',
  name: 'Admin',
  password: MOCK_PASSWORD_HASH,
  createdAt: new Date('2026-01-01'),
};

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('успешный вход — возвращает accessToken и пользователя без пароля', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(MOCK_USER);

      const result = await service.login(MOCK_USER.email, MOCK_PASSWORD);

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.user.id).toBe(MOCK_USER.id);
      expect(result.user.email).toBe(MOCK_USER.email);
      expect(result.user).not.toHaveProperty('password');
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: MOCK_USER.id,
        email: MOCK_USER.email,
      });
    });

    it('неверный пароль — выбрасывает UnauthorizedException', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(MOCK_USER);

      await expect(service.login(MOCK_USER.email, 'wrongpassword')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('неизвестный email — выбрасывает UnauthorizedException', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login('unknown@example.com', MOCK_PASSWORD)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('не раскрывает причину отказа — одинаковое сообщение для email и пароля', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      const unknownEmailError = await service.login('x@x.com', '123456').catch((e) => e);

      mockPrismaService.user.findUnique.mockResolvedValue(MOCK_USER);
      const wrongPasswordError = await service.login(MOCK_USER.email, 'wrongpass').catch((e) => e);

      expect(unknownEmailError.message).toBe(wrongPasswordError.message);
    });
  });

  describe('getMe', () => {
    it('возвращает пользователя по ID без пароля', async () => {
      const userWithoutPassword = {
        id: MOCK_USER.id,
        email: MOCK_USER.email,
        name: MOCK_USER.name,
        createdAt: MOCK_USER.createdAt,
      };
      mockPrismaService.user.findUnique.mockResolvedValue(userWithoutPassword);

      const result = await service.getMe(MOCK_USER.id);

      expect(result.id).toBe(MOCK_USER.id);
      expect(result).not.toHaveProperty('password');
    });

    it('пользователь не найден — выбрасывает UnauthorizedException', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('non-existent-id')).rejects.toThrow(UnauthorizedException);
    });
  });
});
