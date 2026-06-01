class st_system {
    
    static object_merge(...OBJECTS) {
        let new_object = {};
        OBJECTS.forEach(old_object => {
            let recursive = (field, old_object, new_object) => {
                if (typeof old_object[field] == "object")
                    for (let content in old_object[field]) {
                        if (!new_object[field]) new_object[field] = {};
                        recursive(content, old_object[field], new_object[field]);
                    }
                else
                    new_object[field] = old_object[field];
            }
            for (let field in old_object)
                recursive(field, old_object, new_object)
        });
        return new_object
    }

    static generate_unique_prefix(params) {
        params = {
            characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
            length: 16,
    
            ...params,
        };

        return [...Array(params.length)].map(_ =>
            params.characters[Math.random() * params.characters.length | 0]
          ).join('');
    }

}

export default st_system;
