export const validateRequest = (schema) => {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            // result.error.issues is an array of all errors found
            const errorMessages = result.error.issues.map((issue) => issue.message);

            return res.status(400).json({
                message: errorMessages.join(", ")
            });
        }

        // Success: Update body with validated data and move to the controller
        req.body = result.data;
        next();
    };
};