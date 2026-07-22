export interface IUser {
  id: number;

  firstName: string;

  lastName: string;

  email: string;

  password: string;

  phone?: string;

  role: string;

  createdAt: Date;

  updatedAt: Date;
}
