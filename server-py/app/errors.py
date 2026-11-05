class HttpError(Exception):
    """Exception carrying an HTTP status code (port of errors.js httpError)."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def http_error(status: int, message: str) -> HttpError:
    return HttpError(status, message)
