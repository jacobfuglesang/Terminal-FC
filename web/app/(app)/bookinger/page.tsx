import BookingApp from "@/components/BookingApp";
import { loadBookingData } from "@/lib/bookingdata";

export const dynamic = "force-dynamic";

export default async function Bookinger() {
  const { cos, inputs, usdnok, proxies } = await loadBookingData();
  return <BookingApp cos={cos} inputs={inputs} usdnok={usdnok} proxies={proxies} />;
}
