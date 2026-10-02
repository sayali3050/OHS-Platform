import { render, screen } from "@testing-library/react";
import { TextField } from "@/components/ui/field";

test("field errors are announced and linked to the input", () => {
  render(<TextField label="Email" error="Enter a valid email" />);
  const input = screen.getByLabelText("Email");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email");
  expect(input.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
});
