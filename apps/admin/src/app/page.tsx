import { redirect } from 'next/navigation';

/** Корень → редирект на /sessions */
export default function RootPage() {
  redirect('/sessions');
}
