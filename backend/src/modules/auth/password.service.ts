import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

const passwordHashOptions: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
};

@Injectable()
export class PasswordService {
  hash(password: string) {
    return argon2.hash(password, passwordHashOptions);
  }

  verify(passwordHash: string, password: string) {
    return argon2.verify(passwordHash, password);
  }
}
